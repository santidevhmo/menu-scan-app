# Competitor teardown — summary

Phase 1, step 1.2 of `docs/mobile-app-design-phase-order.md`. Generated **2026-08-30**.
Six apps, approved by Santiago from `../competitors-shortlist.md`.

**Method and its limits.** The `competitor-profiling` skill assumes SaaS websites and needs
Firecrawl + DataForSEO, neither installed. Adapted: for a consumer mobile app the **App Store
listing is the homepage and the pricing page**, so that's what was scraped (iTunes lookup API +
WebFetch), plus each app's marketing site where one exists. The SEO/backlinks phase was dropped as
inapplicable — see "What this teardown cannot see" at the bottom.

---

## ⚠️ This section was wrong twice. Read the third version.

**Superseded 2026-08-30 by `../web-research-2026-08-30.md`.**

| Version | Claim | Verdict |
|---|---|---|
| Shortlist v1 | MenuFit doesn't scan menus; it's a restaurant database | **Substantially right** |
| This teardown v2 | MenuFit *does* scan; it already does everything we do | **Wrong** |
| Deep research v3 | MenuFit is **database-lookup first**, with AI-generated menu data. A scan feature appears in update notes but *"is not the core mechanism and is not validated in reviews"* | **Current** |

**Why v2 was wrong:** it rested on a web-search summary of app-directory sites (Softonic,
SourceForge) whose descriptions are auto-generated. The deep research names that exact trap:
*"Some third-party listings, e.g. Softonic, describe a scan feature."* A directory blurb is not
evidence of a shipped mechanic. Primary sources — the App Store listing, the developer's own
statements, and user reviews — all describe a **search-a-restaurant-by-name** flow.

**The standing finding:** menu-photo OCR is *not* what the incumbent does. It is genuine
whitespace, and MenuFit's database approach breaks exactly where ours would work.

---

## The field

| App | Ratings | Age | Ratings/mo | Mechanic | Languages | Category |
|---|---:|---|---:|---|---|---|
| **Cal AI** | 359,755 | 2y 5m | ~12,400 | Photo of **plated food** | **15 incl. ES** | Health & Fitness |
| **Carb Manager** | 734,055 | 15y 8m | ~3,900 | Barcode + plate photo | EN | Health & Fitness |
| **MenuFit** | 54,084 | 1y 0m | **~4,160** | **Menu scan + restaurant DB + AI chat** | EN | Health & Fitness |
| **FoodieFit** | 725 | 4m | ~181 | **Menu photo → calories/macros** | EN | Health & Fitness |
| **Menu Order AI** | 69 | 9m | ~7 | **Menu scan, explicitly no database** | EN | Health & Fitness |
| **Forq** | 1 | 2m | ~0.5 | **Menu scan → visual menu** | **11 incl. ES** | Food & Drink |

*Ratings/month is a crude traction proxy, not downloads or revenue. Rating counts are cumulative
and Apple resets them on major versions, so treat older apps' rates as understated.*

## What this tells us

**1. Menu-photo scanning is a real wedge, not table stakes.** *(Rewritten after deep research —
this section previously said the opposite.)*
No app with meaningful traction is scan-first. MenuFit (54k ratings) searches a database. Cal AI
(360k) photographs *plated food*, which is a different job — it can't help you before you order.
The scan-first apps are all tiny: FoodieFit 725, Menu Order AI 69, Forq 1. The mechanic is
uncontested at the top, and **MenuFit's database breaks precisely where scanning works**:

- *"most local restaurants did not feature the full menu, so it was not useful for me at all"*
- *"it's useless in the UK… Don't bother if you live in the UK"*
- A Chinese restaurant *"was showing a Mexican menu and giving Mexican dish recommendations"*
- It publishes **no restaurant count anywhere** — only "every restaurant in the world." A database
  business with real coverage would quote the number.

**2. MenuFit's traction is the outlier and the thing to explain.**
~4,160 ratings/month against FoodieFit's ~181 and Menu Order AI's ~7 — for products that describe
themselves almost identically. A 20–500× gap between similar products is rarely the product. The
likely explanations, in order of probability: paid acquisition spend, App Store search dominance,
or an onboarding funnel that harvests ratings before the paywall. **Nothing in a store listing can
distinguish these** — see the open questions.

**3. Everyone is hard-paywalled, and users are angry about it.**
MenuFit states it plainly in its own listing: *"Our app requires a subscription to access the
complete experience... Before subscribing, you'll get a limited selection of meals."*
Secondary coverage of its reviews reports *"a significant number of users express frustration over
the mandatory subscription model, often feeling misled after extensive onboarding."*

Price ladders (App Store IAP, USD):

| App | Advertised IAP price points |
|---|---|
| MenuFit | $9.99 · $14.99 · $23.90 · $30.00 · $32.00 · $48.00 · Omni Plan $34.99 |
| FoodieFit | $3.99 · $19.99 · $29.99 · $39.99 |
| Carb Manager | $8.49/mo · $16.49/3mo · $29.99–$59.99/yr |

MenuFit showing seven price points suggests active price testing or regional pricing. **This is the
clearest opening in the teardown:** the incumbent's own users say the paywall feels like a
bait-and-switch after a long onboarding.

**4. Calorie accuracy is the most-punished failure in the category — and it's quantified.**
Users don't just complain, they compute the error and cancel:

> *"the calorie counts were completely off both times… off by over 200 calories… At Tazikis this
> was a 28% error and at McDonalds a 40% error… I could not justify continuing to use this app
> (or especially to pay for the app)"* — MenuFit reviewer, US App Store

Cal AI is criticized on the same axis (~33% underestimate in a Lifehacker test). The peer-reviewed
picture, from `../web-research-2026-08-30.md`:

| Finding | Source |
|---|---|
| Photo alone: **~30.5% mean absolute percentage error**. Add a short ingredient description: **~13.9%** | Chen et al. 2025, *Nutrients* |
| AI-vs-truth calorie error ranged 0.10%–38.3% across 52 studies; lower for simple foods | Tay et al. 2023, *Annals of Medicine* |
| **Portion estimation, not food identification, is the hard part** | consistent across reviewers |

This lands squarely on this repo's Stage-2 macro work. Two design consequences follow directly:
**ship a confidence indicator**, and **design the UX to solicit an ingredient description** — the
literature says that one input roughly halves the error. Do not market an accuracy number we
haven't measured; the "90% accurate" claim Cal AI's founder makes is unsupported.

**5. Spanish-language menu scanning is genuinely open — and the pain is bigger there.**
Every menu-focused competitor (MenuFit, Menu Order AI, MenuPal, CalorieCap, FoodieFit) is
English-only. The only competitive-set app with Spanish is Cal AI, which scans plates, not menus.
The Spanish space is held by plate-photo and barcode apps — Yuka, MyRealFood, YAZIO, Foodvisor —
none of them menu tools. The closest thing found is **Carmen AI**, a small emerging vendor.

**The reinforcing fact:** calorie labeling is **not mandatory in Spain**, unlike NYC. Spanish-market
menus rarely print calories at all — so the problem the product solves is *larger* in Spanish-speaking
markets than in the US.

Caveat worth keeping: the App Store Languages field is UI localization, not menu-parsing ability.

**6. Two apps position against the database, not with it.**
Menu Order AI's listing: *"No logging. No searching a database. Just your best options."*
Forq sits in **Food & Drink**, not Health & Fitness, and sells a *visual* menu — dish photos first,
calories second. Two different escapes from competing with MenuFit head-on.

---

## Positioning map

```
                    scan any menu (works anywhere)
                              ▲
              Menu Order AI   │   Forq
              (GLP-1 niche)   │   (visual menu, 11 langs)
                              │
     nutrition ◄──────────────┼──────────────► experience
      focus                   │                  focus
                    MenuFit   │   FoodieFit
                  (scan + DB + chat)
                              │
                              ▼
                    pre-built database / logging
                    Cal AI · Carb Manager
                    (photograph the plate, not the menu)
```

Menu Scan's current feature list — scan, goal sort, allergens, price sort, profiles, history —
puts it **on top of MenuFit**, the most contested spot on the map, in English. Its differentiated
territory is the upper-right and the Spanish axis, neither of which is where the product currently
aims.

## Likes and dislikes (the playbook's actual ask)

**Worth stealing**

- **Menu Order AI's "Smart Tweaks"** — suggests modifications that preserve the dish ("dressing on
  the side," "grilled not fried"). Turns a ranking into an action. MenuFit copied it.
- **Menu Order AI's speed promise** — *"Know what to order in about 10 seconds."* Concrete,
  falsifiable, and it names the real anxiety: the server is coming back.
- **Forq's dish photos** — solves *"branzino al cartoccio tells you nothing,"* a problem nutrition
  framing misses entirely. Strong for foreign-language and unfamiliar menus.
- **FoodieFit's before/after framing** — *"Most nutrition apps track what you already ate.
  FoodieFit helps you choose before you order."* One sentence that separates the category from
  MyFitnessPal.
- **MenuFit's "works even if the menu has no calories or macros listed"** — names the objection
  before the user thinks of it.

**Worth avoiding**

- **Long onboarding into a hard paywall.** The incumbent's most-reported complaint. Its own listing
  admits you only get "a limited selection" before paying.
- **Unhedged accuracy.** Reported wrong calorie counts are the second complaint theme.
- **English-only.** Three of the four menu scanners; the reason the Spanish slot is open.
- **Category confusion.** Forq's Food & Drink placement may explain why a well-built app has one
  rating — it isn't where people search for this.

---

**7. Two facts that change the threat model** *(from the deep research)*

- **Cal AI was acquired by MyFitnessPal**, closing December 2025 (TechCrunch, March 2026). It had
  15M+ downloads and $30M+ annual revenue in under two years. The design benchmark is now backed by
  the largest incumbent in nutrition tracking. Menu scanning becoming a MyFitnessPal feature is no
  longer a small-team decision.
- **Menu Order AI removed its paywall in June 2026** — unlimited free menu analysis for everyone.
  The closest scan-first competitor just made scanning free, which sets the price expectation we
  will be launching into.

**8. The market is winner-take-most.** Top 5% of newly launched apps earn ~$8,880 after year one —
**over 400× the bottom 25%** (≤$19). Health & Fitness has the highest 60-day revenue-per-install of
any category ($0.63 median) and a median trial-to-paid of 39.9%. High ceiling, brutal floor.

---

## Open questions this teardown cannot answer

Five questions were open at v2. The deep research closed four:

| Question | Status |
|---|---|
| Why is MenuFit 20–500× ahead? | **Answered.** Not the product — a viral fast-food-swap short-form video engine by founder Cole Kosco. Creator-led video is the category's proven channel; Cal AI scaled the same way on 150–250 influencers on retainer. |
| What do users actually complain about? | **Answered.** Hard paywall after long onboarding, then calorie inaccuracy. Verbatim quotes in `../web-research-2026-08-30.md` Q1. |
| How accurate are competitors really? | **Answered.** 28–40% (MenuFit), ~33% (Cal AI), ~30.5% category baseline from photo alone. |
| Does the database work abroad / at independents? | **Answered. No.** Breaks at independents, "useless in the UK", no published restaurant count. |
| What does MenuFit's onboarding→paywall funnel look like? | **Answered 2026-08-30** — walked and captured. **27 screens, no skip, no real product use before the paywall.** Menu Order AI does it in **6, with a real scan before paying.** See `../competitor-onboarding/README.md`. |

**Reddit was the one gap the web research could not fill.** It reports: *"Reddit threads in
r/loseit, r/keto, r/nutrition, r/fitness, r/EatCheapAndHealthy specifically naming these seven apps
were not surfaced."* The `customer-research` skill's Mode 2 (Digital Watering Hole Research) is
built for exactly this and has not been run — see the skills note in `../competitors-shortlist.md`.

## What this teardown cannot see

App Store listings show what a company *says*, never what its users do. Missing: downloads,
revenue, retention, conversion, ad spend, and primary review text (Apple's public review RSS feed
returns zero entries for every app tested, including WhatsApp — it is retired, not app-specific).
Every traction statement here rests on cumulative rating counts, which is a proxy and nothing more.

## Raw data sources

- iTunes lookup API, US + MX, pulled 2026-08-30 → `raw/<slug>/2026-08-30/itunes-{us,mx}.json`
- App Store listing pages via WebFetch, 2026-08-30 (MenuFit, FoodieFit, Carb Manager)
- Marketing sites: `menuorderai.com`, `fforq.vercel.app`, 2026-08-30
- Secondary coverage of MenuFit reviews via web search, 2026-08-30 — **secondary, not primary**
- Discovery sweep: `../competitors-shortlist.md`, `../sweep.json`
