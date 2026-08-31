# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-08-30
**Status:** DRAFT — awaiting Santiago's review. Nothing here is ruled until he says so.

> **Where the evidence lives.** This document does not restate research; it decides things *from*
> it. Every factual claim traces to one of:
> `docs/research/web-research-2026-08-30.md` (deep research, sourced) ·
> `docs/research/competitor-profiles/_summary.md` (teardown + positioning map) ·
> `docs/research/competitor-profiles/*.md` (six profiles) ·
> `docs/research/competitors-shortlist.md` (how the six were found) ·
> `AGENTS.md` (what we actually built).
> Written at step **1.6** of `docs/mobile-app-design-phase-order.md`.

---

## Product Overview

**One-liner:**
Point your phone at the menu in front of you — in Spanish or English — and see every dish
re-ordered by your goals, before the server comes back.

**What it does:**
You pick your nutritional goals and put them in priority order. You photograph the restaurant's
paper menu. Menu Scan reads the menu itself — not a database of restaurants — estimates macros
and allergens per dish, and returns the same menu sorted by how well each item fits your goals.
Filters (allergen exclusions, calorie range, price) narrow it further, and results re-rank
instantly when you change your mind, with no second scan.

**Product category (the shelf):**
**Health & Fitness**, sub-shelf *nutrition / eating out*. This is a positioning decision, not a
description: Forq ships the closest feature list in the market and sits in **Food & Drink**, where
nobody with nutrition intent is searching, and has **1 rating in 3 months**. Same product, wrong
shelf. We list in Health & Fitness.

**What we are NOT, and must never be marketed as:**

| Not this | Because |
|---|---|
| A calorie **logger** | We work *before* you eat, not after. Logging is MyFitnessPal's job and it is a fight we lose. |
| A restaurant **database** | We never claim coverage of a restaurant list. Coverage claims are exactly what breaks MenuFit. |
| A **plate**-photo app | Cal AI photographs food you already ordered. That is a different job at a different moment. |
| A **medical** or allergy-safety tool | Everything is an AI estimate. The allergen disclaimer is mandatory and non-removable (`AGENTS.md`). |
| A **diet** app | No weight-loss promise, no meal plans, no coaching. |

**Product type:** Consumer mobile app (iOS + Android, Expo/React Native).

**Business model:**
MVP ships **free, no paywall** — onboarding and subscription are explicitly post-MVP in `AGENTS.md`.
The price expectation we launch into is set by **Menu Order AI, which removed its paywall in June
2026** (unlimited free scans) and by MenuFit's $9.99/mo — $19.99/yr floor. When monetization does
arrive, the pattern the 2025–26 evidence supports is a hard paywall placed **after** a real value
moment (1–3 scans), annual-forward pricing, and goals collected in onboarding and referenced on the
paywall. That is a phase-4/5 decision; `pricing` / `paywalls` skills own it, not this document.

---

## Target Audience

**Primary use case:**
You are sitting in a restaurant with an active nutritional goal and a menu that does not print
calories, and you have about ninety seconds to decide.

**Jobs to be done:**
- *"Tell me which of these forty dishes actually fits what I'm doing — now, before I order."*
- *"Read this menu for me. I can't tell what's in half of these dishes."*
- *"Let me eat out without either guessing or giving up on the goal for the day."*

**Segments (B2C — there is no buying committee):**

| Segment | Who | What they care about | The value we promise |
|---|---|---|---|
| **Goal-tracker who eats out** | Cutting, bulking, or hitting a protein number; already tracks at home | Hitting the macro, not being "the difficult one" at the table | The best-fitting dish on *this* menu in seconds |
| **Spanish-speaking diner (MX / ES / LatAm)** | Same goals, but menus where calorie labeling is **not mandatory** and effectively never printed | Any signal at all — today there is none | The only app that reads the menu in its own language |
| **Restriction-driven diner** | Allergies, intolerances, keto/paleo/religious exclusions | Ruling dishes *out* fast and safely | Ingredient exclusions applied to the whole menu at once, with an honest disclaimer |
| **GLP-1 user** | On Ozempic/Wegovy, ordering anxiety, small appetite | What to order and how to modify it | Adjacent, not our wedge — Menu Order AI owns the language here and still has 69 ratings |

**Use cases:** an independent restaurant with no online menu · a menu abroad or in a second
language · a takeout menu at home before ordering · a chain whose app-listed calories are wrong ·
re-checking a past scan from history rather than re-scanning.

---

## Problems & Pain Points

**Core problem:**
The moment you need nutrition information is the one moment you cannot get it. Menus mostly do not
print calories — and outside the US chains, essentially never. Everything the market has built
works either *before* you leave home (search a database) or *after* the plate arrives (photograph
it). Nothing works on the menu in your hand.

**Why alternatives fall short:**

| Alternative | Where it breaks | Evidence |
|---|---|---|
| **MenuFit** (54k ratings, the category leader) | Database lookup. No coverage at independents, wrong menus at the wrong restaurant, *"useless in the UK"*. Publishes **no restaurant count anywhere** — only "every restaurant in the world." | `_summary.md`, research Q4 |
| **Cal AI / MyFitnessPal** (15M+ downloads) | Photographs the **plate**. Useless before you order — the decision is already made. | research Q1/Q3 |
| **Carb Manager** | Barcode + logging. Same after-the-fact problem, plus ads for paying users. | research Q1 |
| **FoodieFit / Menu Order AI / Forq** | Genuinely scan-first, and genuinely tiny (725 / 69 / 1 ratings). All **English-only** except Forq, which is on the wrong shelf. | `_summary.md` field table |
| **Asking the server / eyeballing it** | The real default. Free, fast, and wrong — *"guessing almost always leads to overeating"* (FoodieFit's own listing). | competitor profile |

**What it costs them:**
A meal out that silently blows the day's target, several times a week — and the slower cost:
people stop eating out, or stop tracking, because the two cannot coexist.

**Emotional tension:**
Time pressure with an audience. The server is standing there. The choice feels like a test you can
fail in public, and the fallback — order the salad, ask for dressing on the side, hope — is
unsatisfying every single time.

---

## Competitive Landscape

**Direct (same job, same mechanic — read a menu, rank dishes):**
- **FoodieFit** — best framing in the market (*"Most nutrition apps track what you already ate;
  FoodieFit helps you choose before you order"*), no differentiation beyond it, English-only, no
  marketing site.
- **Menu Order AI** — sharpest copy in the market, GLP-1 niche, **free unlimited scans since June
  2026**, and ~7 ratings/month. Proof that positioning alone does not buy traction.
- **Forq** — closest feature list to ours (calories + allergens + price, 11 languages incl. Spanish)
  and effectively zero traction, in the wrong App Store category.

**Direct (same job, different mechanic — the actual incumbent):**
- **MenuFit** — restaurant database with AI-generated menu data, English-only, hard paywall before
  any value. Its traction (~4,160 ratings/mo) is explained by a **creator-led short-form video
  engine**, not by the product. Its database is exactly what breaks where we work.

**Secondary (different mechanic, adjacent job):**
- **Cal AI (now MyFitnessPal)**, **Carb Manager**, **YAZIO / Lifesum / Foodvisor** — log or estimate
  what you already have. Note the acquisition: menu scanning becoming a MyFitnessPal feature is no
  longer a small-team decision.

**Indirect (the honest competitor):**
- Asking the server, googling the restaurant, or not caring. This is what most of the market does
  today, and it is free.

**The standing finding — do not re-derive it, and do not reverse it without a primary source:**
**Menu-photo OCR is genuine whitespace.** No app with meaningful traction is scan-first. This claim
was wrong twice before landing (see the version table in `_summary.md`); the error both times came
from auto-generated app-directory blurbs. A directory description is never evidence of a shipped
mechanic.

---

## Differentiation

**Key differentiators:**

| # | Differentiator | Who else has it |
|---|---|---|
| 1 | **Reads the menu, not a database** — works at the independent, abroad, on a takeout flyer | The three tiny scan apps; not the leader |
| 2 | **The output is a re-ordered menu, not a number** — multi-goal, drag-to-prioritize, re-ranks client-side with no second scan | **Nobody** |
| 3 | **Bilingual by construction** — the pipeline keeps the menu's own words; English is an internal lookup key, never the UI | Only Forq, on the wrong shelf |
| 4 | **Allergen exclusions across the whole menu**, with a permanent honesty disclaimer | Only Forq |
| 5 | **Price as a first-class sort** | Only Forq |
| 6 | **Saved profiles** ("Post-gym") and searchable scan history | Nobody in this set |

**How we do it differently:**
Two-stage extraction (transcribe → structure) then per-ingredient enrichment, where **the model
supplies knowledge and our code does the arithmetic** (`AGENTS.md`). That is an engineering fact,
not a marketing claim — it never appears in copy — but it is why we can be honest about estimates
instead of asserting a number.

**Why customers choose us:**
Because the app opens on the menu they are actually holding, in the language it is actually
printed in, and hands back that same menu in their order of priority.

🔴 **The accuracy rule — binding on every downstream skill.**
Do **not** market an accuracy percentage. Not ours, not a comparison. Cal AI's founder markets
"90% accurate" and no peer-reviewed evidence supports it. The published baselines are ~30.5% error
from a photo alone, falling to ~13.9% when the user adds a short ingredient description (Chen et
al. 2025, *Nutrients*), and MenuFit reviewers **compute the error themselves (28–40%) and cancel**.
The differentiator is therefore **honesty, not precision**: show a confidence indicator, let people
edit, and design the flow to ask for that one-line ingredient description. An unhedged number is
the single most punished thing in this category.

---

## Objections

| Objection | Response |
|---|---|
| *"How do I know the calories are right?"* | You don't, and neither does anyone else — every app here is estimating. We show how confident we are, we let you correct the dish, and adding one line about what's in it measurably halves the error. We never publish a number we haven't measured. |
| *"Menu Order AI is free and MenuFit is $20 a year."* | Both are English-only, and MenuFit doesn't read menus at all — it looks up a restaurant it may not have. MVP is free; when we charge, you'll have already seen it work. |
| *"I already have MyFitnessPal / Cal AI."* | Keep them. They work after you eat. This one works while you're deciding. |
| *"Will it work on this menu?"* (handwritten, chalkboard, Spanish, badly lit) | The Spanish menu is the case we were built for. Photograph as many pages as you need; there's no frame to line up. |
| *"Is it safe for my allergy?"* | No. It's an AI estimate and the app says so on every result screen with a filter active. Confirm with the restaurant. |

**Anti-personas (do not target, do not write copy for):**
- People who rarely eat out — the pain is the restaurant.
- People who want a food **diary** — that is a different product and a losing fight.
- Anyone needing clinically reliable numbers: severe allergies, insulin dosing, medical diets.
- **Restaurants** (B2B menu digitization). Different buyer, different product, not this.

---

## Switching Dynamics

| Force | What it is here |
|---|---|
| **Push** | The database app had no menu for tonight's restaurant, or showed the wrong one. The paywall arrived before anything worked. They computed the calorie error themselves and felt cheated. Their language isn't supported at all. |
| **Pull** | It works on the menu in your hand, in your language, and the answer is the menu itself, reordered. No restaurant to look up, no plate to wait for. |
| **Habit** | Eyeballing it, asking the server, ordering the healthy-sounding thing. Free, instant, and already a habit. Also: an annual subscription they've already paid for elsewhere. |
| **Anxiety** | "Will the numbers be nonsense?" · "Will it read *this* menu?" · "Will a free trial quietly charge me?" — a real, quantified fear in this category, including a Spanish-language billing complaint on the Mexican App Store. |

**The design consequence:** the habit is free and instant, so the first scan has to be free and
instant too. Anything that gates before the first working result is fighting the strongest force
in the table with the weakest hand — and it is precisely MenuFit's most-reported complaint.

---

## Customer Language

**How they describe the problem (verbatim, from competitor reviews and listings):**
- *"most local restaurants did not feature the full menu, so it was not useful for me at all"*
- *"it's useless in the UK… Don't bother if you live in the UK"*
- *"most restaurant menus don't show calories — and guessing almost always leads to overeating"*
- *"Forty dishes on the menu and not one picture"*
- *"I used to get so much anxiety eating out"*
- *"took the guessing game out"*
- *"the calorie counts were completely off both times… a 28% error… a 40% error… I could not
  justify continuing to use this app"*

**Framings worth borrowing (credited in `_summary.md`):**
- **before/after** — *"track what you already ate"* vs *"choose before you order"*. The single
  clearest line separating this category from MyFitnessPal.
- **the clock** — *"know what to order in about 10 seconds," "before the server comes back."*
  Concrete and falsifiable; names the real anxiety.
- **naming the objection first** — *"works even if the menu has no calories or macros listed."*
- **the action, not the ranking** — Menu Order AI's "Smart Tweaks" ("dressing on the side,"
  "grilled not fried"). MenuFit copied it. We do not have it; it is the strongest single feature
  idea in the market.

**Words to use:** before you order · any menu, any language · in your order of priority ·
estimate · what's actually in it · the menu in front of you.

**Words to avoid:**

| Avoid | Why |
|---|---|
| any accuracy % | Unmeasured, and the most punished claim in the category |
| "every restaurant in the world" / any coverage claim | The incumbent's claim; reviewers disprove it in public |
| "calorie counter", "food diary", "log" | Puts us on MyFitnessPal's shelf |
| "diet", "cheat meal", "guilt-free" | Wrong register; no weight-loss promise |
| "safe for allergies", "allergen-free" | Directly contradicts the mandatory disclaimer |
| "AI-powered" as the headline | Table stakes in this category; every competitor says it |

**Glossary:**

| Term | Meaning |
|---|---|
| **Scan** | One or more photos of a menu → a parsed, enriched, sorted item list |
| **Goal** | A preset nutritional objective (High Protein, Low Calorie…), multi-select and rank-ordered |
| **Profile** | A saved set of goals + filters with a name and emoji, e.g. "Post-gym" |
| **Re-rank** | Re-sorting a scan's saved results without spending another scan |
| **Menu-first / scan-first** | Reads the printed menu, as opposed to looking a restaurant up in a database |
| **Plate-photo** | The Cal AI mechanic — photographing food already served |

---

## Brand Voice

**Tone:** plain, quick, and honest about uncertainty. Speaks like a friend who happens to know
food, not a nutrition brand and not a wellness brand.

**Style:** short sentences, concrete nouns, second person. Names the limitation before the user
finds it. No hype adjectives; the product's own numbers are hedged, so the copy is too.

**Personality:** direct · fast · bilingual · unpretentious · candid.

**Register check:** if a line would look absurd next to *"AI-estimated. Confirm allergens with
restaurant staff before ordering."* — the one sentence that is always on screen — the line is wrong.

---

## Proof Points

⚠️ **We have none, and this section exists to stop a downstream skill from inventing some.**
No users, no downloads, no ratings, no testimonials, no revenue, no press. Any skill reading this
document must write copy that makes **zero** empirical claims about Menu Scan's performance or
adoption.

| Available to us | Usable in marketing? |
|---|---|
| Internal extraction benchmark scores | ❌ **No.** Internal, run-to-run variable, and measured against our own oracle. Never quote a benchmark number externally. |
| Category accuracy literature (Chen 2025, Tay 2023) | ⚠️ Only as *category* context — never as a claim about us. |
| Competitor weaknesses (coverage gaps, English-only) | ✅ Yes, quoted from public reviews, attributed. |
| Feature comparison (bilingual, allergens, price, goal-ranking) | ✅ Yes — these are shipped facts, not performance claims. |

**Value themes and where their proof must come from:**

| Theme | Proof we need before claiming it |
|---|---|
| "Works where the database doesn't" | A demo on a real independent menu — we have real photos of real paper menus in `scripts/fixtures/` |
| "Reads Spanish menus" | Same, on a Spanish menu; this one we can show today |
| "Honest about estimates" | The confidence indicator has to exist in the UI first |
| "Faster than deciding yourself" | An actual timed scan on a real menu |

---

## Goals

**Business goal:** validate that scan-first, goal-ranked, bilingual menu reading pulls users the
database incumbent structurally cannot serve — before MyFitnessPal ships menu scanning into Cal AI.

**Key conversion action (MVP, pre-paywall):** **first completed scan with a goal set** — the value
moment. Every other metric is downstream of it.

**Secondary:** second scan within 7 days (the eating-out cadence), and a saved profile.

**Current metrics:** none. Pre-launch.

**Channel note for downstream skills:** the category's proven acquisition channel is **creator-led
short-form video** — MenuFit's 20–500× traction lead over identically-described products is a video
engine, and Cal AI scaled the same way on 150–250 influencers on retainer. Positioning here is
written to be sayable to camera in one line. See `influencer-marketing`.

---

## Open Questions (do not let a downstream skill answer these by guessing)

| Question | Owner |
|---|---|
| Reddit voice-of-customer — the one gap the web research could not fill | `customer-research` Mode 2, step 1.7 |
| What MenuFit's onboarding→paywall funnel actually looks like | Santiago is installing the three apps |
| Whether "Smart Tweaks"-style dish modifications belong in scope | Product decision, not a marketing one |
| Free-scan quota and paywall placement | `pricing` / `paywalls`, post-MVP |

---

## Changelog
*Newest first. One line per revision: what changed and why.*
- v1 (2026-08-30) — Initial context. Positioning derived from the phase-1 market scan, six-app
  teardown, and sourced deep research: scan-first + goal-ranked + bilingual as the wedge, Health &
  Fitness as the shelf, and honesty-over-precision as the accuracy stance. Records a binding rule
  against marketing any accuracy number.
